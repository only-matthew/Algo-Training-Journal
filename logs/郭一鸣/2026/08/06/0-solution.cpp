#include<iostream>
#include<algorithm>
using namespace std;
int color[200005];
int num[200005];
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        cin>>n;
        int m=0;
        for(int i=1;i<=n;i++)
        {
            int x;cin>>x;
            if(m==0||color[m]!=x)
            {
                m++;
                color[m]=x;//记录颜色
                num[m]=1;//记录数量
            }
            else num[m]++;
        }
        int add=0;
        for(int i=1;i<m;i++)
        {
            if(num[i]>=2&&num[i+1]>=2)add=2;
            else if(num[i]>=2)
            {
                if(i+1==m||color[i+2]!=color[i])add=max(add,1);
            }
            else if(num[i+1]>=2)
            {
                if(i==1||color[i-1]!=color[i+1])add=max(add,1);
            }
        }
        cout<<m+add<<endl;
    }
    return 0;
}