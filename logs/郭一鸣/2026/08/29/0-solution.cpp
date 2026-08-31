#include<iostream>
#include<algorithm>
#include<cstdio>
using namespace std;
struct pe{
    int t,id;
}a[1010];
bool cmp(pe x,pe y)
{
    if(x.t==y.t)return x.id<y.id;
    return x.t<y.t;
}
int main()
{
    int n;cin>>n;
    for(int i=1;i<=n;i++)
    {
        cin>>a[i].t;
        a[i].id=i;
    }
    sort(a+1,a+n+1,cmp);
    for(int i=1;i<=n;i++)
    {
        cout<<a[i].id;
        if(i<n)cout<<" ";
    }
    cout<<endl;
    long long sum=0;
    long long now=0;
    for(int i=1;i<=n;i++)
    {
        sum+=now;
        now+=a[i].t;
    }
    double aver=(double)sum/n;
    printf("%.2f\n",aver);
    return 0;
}