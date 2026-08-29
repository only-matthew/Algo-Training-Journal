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