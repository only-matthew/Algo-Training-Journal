#include<cstdio>
#include<map>
#include<queue>
#include<algorithm>
using namespace std;
map<int,int> p;//记录的是以a[i]结尾的组是哪一个小根堆。
priority_queue<int,vector<int>,greater<int> > q[100005];
int n,a[100005],k,s,ans=1<<30;
int mn(int x,int y){return x>y?y:x;}//min
int read(){
	int x=0,flag=1;char c=getchar();
	while(c<'0'||c>'9'){flag*=(c=='-'?-1:1);c=getchar();}
	while(c>='0'&&c<='9'){x=(x<<3)+(x<<1)+c-'0';c=getchar();}
	return flag*x;
}
int main(){
	n=read();
	for(int i=1;i<=n;++i)
		a[i]=read();
	sort(a+1,a+n+1);
	for(int i=1;i<=n;++i){
		if(p[a[i]]==0)p[a[i]]=++k;//如果a[i]之前从未出现，就新开一个小根堆。
		if(p[a[i]-1]==0||q[p[a[i]-1]].size()==0)//不能接上任何一组
			q[p[a[i]]].push(1);
		else {//能接上一组
			s=q[p[a[i]-1]].top()+1;//加给以a[i]-1结尾最小的那个组
			q[p[a[i]-1]].pop();//删除该组
			q[p[a[i]]].push(s);//组大小+1，再放进以a[i]结尾的小根堆。
		}
	}
	for(int i=1;i<=n;++i){
		if(q[p[a[i]]].size()>0)//注意，如果小根堆为空不能取top
			ans=mn(ans,q[p[a[i]]].top());//用以a[i]结尾的最小组更新答案
	}
	printf("%d\n",ans);
	return 0;
}

#include <cstdio>
#include <stack>
#include <algorithm>
const int MAXN = 100000 + 5;
int n, a[MAXN];
std::stack<int> st[MAXN];
int main()
{
    scanf("%d", &n);
    for (int i = 1; i <= n; i++)
        scanf("%d", &a[i]);
    std::sort(a + 1, a + n + 1);
    int top = 0, flag = 0;
    for (int i = 1; i <= n; i++)
    {
        for (int j = top; j > 0; j--)
        {
            if (st[j].top() + 1 == a[i])
            {
                st[j].push(a[i]);
                flag = 1;
                break;
            }
            else
                flag = 0;
        }
        if(flag==0){
            st[++top].push(a[i]);
        }
    }
    int minn=1*10*10*10*10*10;
    for(int i=1;i<=top;i++){
        int tmp=st[i].size();
        minn=std::min(minn,tmp);
    }
    printf("%d",minn);
}