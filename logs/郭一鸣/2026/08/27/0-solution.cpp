#include<iostream>
#include<algorithm>
using namespace std;
struct cont
{
    int a,b;
}x[1000010];
bool cmp(cont x,cont y)
{
    return x.b<y.b;
}
int main()
{
    int n;cin>>n;
    for(int i=1;i<=n;i++)cin>>x[i].a>>x[i].b;
    sort(x+1,x+n+1,cmp);
    int ans=0;
    int t=0;
    for(int i=1;i<=n;i++)
    {
        if(x[i].a>=t)
        {
            ans++;
            t=x[i].b;
        }
    }
    cout<<ans<<endl;
    return 0;
}